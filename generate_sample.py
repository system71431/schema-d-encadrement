"""Generate a realistic Strava-style activities.csv for testing run-analytics.html.

Simulates ~18 months of training for an amateur runner progressing from
VDOT ~42 (21min 5k) to VDOT ~50 (18:30 5k), with mixed session types,
race PBs, occasional injuries (low-volume weeks), and non-run activities
mixed in (so the parser has to filter).
"""

import csv
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)

OUT = Path(__file__).parent / "activities.csv"

# ---------- Performance model ----------

def vdot_to_time(vdot, dist_km):
    """Bisect to find race time at given VDOT and distance."""
    def vdot_at(d, t_sec):
        v_mpm = (d * 1000) / (t_sec / 60)
        t_min = t_sec / 60
        vo2 = -4.60 + 0.182258 * v_mpm + 0.000104 * v_mpm**2
        pct = 0.8 + 0.1894393 * math.exp(-0.012778 * t_min) + 0.2989558 * math.exp(-0.1932605 * t_min)
        return vo2 / pct
    lo, hi = 60.0, 12 * 3600.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if vdot_at(dist_km, mid) > vdot: lo = mid
        else: hi = mid
    return (lo + hi) / 2

def race_pace(vdot, dist_km):
    return vdot_to_time(vdot, dist_km) / dist_km  # sec/km

def easy_pace(vdot):
    # Easy ~ 75-80% of marathon pace effort -> roughly marathon pace + 60-90s
    mp = race_pace(vdot, 42.195)
    return mp + 75

def long_pace(vdot):
    return easy_pace(vdot) + 15

def threshold_pace(vdot):
    # ~ 1-hour race pace, between 10k and HM
    return race_pace(vdot, 15)

def interval_avg_pace(vdot):
    # Whole session avg (warmup+intervals+recovery+cooldown)
    # Faster than easy but with rests, so ~ tempo-ish overall
    return race_pace(vdot, 10) + 30

# ---------- Athlete profile ----------
# Homme de 58 ans, bon coureur amateur entraîné.
# HRmax estimée ~175 (Tanaka: 208 - 0.7*58 = 167, majorée car bien entraîné).
# FC repos basse typique d'un coureur de fond.

HR_MAX = 175
HR_REST = 50
WEIGHT_KG = 72

# ---------- Profile / progression ----------

START_DATE = datetime(2024, 10, 1, 7, 30)
WEEKS = 78  # 18 months

def vdot_at_week(w):
    """Smooth progression with some plateaus and a small dip mid-cycle."""
    base = 42 + (50 - 42) * (1 - math.exp(-w / 30))
    # Small wave + noise
    wave = 0.4 * math.sin(w / 8)
    noise = random.gauss(0, 0.25)
    # Mid-cycle dip (illness/break)
    if 28 <= w <= 32:
        base -= 1.5
    return max(40, base + wave + noise)

def weekly_volume(w, vdot):
    """Target km/week — builds up, has recovery weeks, deload around races."""
    base = 25 + (60 - 25) * min(1.0, w / 50)
    # Recovery week every 4
    if w % 4 == 3:
        base *= 0.65
    # Mid-cycle low (matches dip)
    if 28 <= w <= 32:
        base *= 0.4
    # Pre-race taper
    if w in (24, 48, 70):
        base *= 0.6
    return base * random.uniform(0.9, 1.1)

# ---------- Session generator ----------

SESSION_TEMPLATES = [
    ("easy", 0.55),
    ("long", 0.18),
    ("tempo", 0.12),
    ("intervals", 0.08),
    ("recovery", 0.07),
]

RACE_WEEKS = {
    25: ("10 km", 10.0, "race_10k"),
    49: ("Semi-marathon", 21.0975, "race_hm"),
    71: ("Marathon", 42.195, "race_marathon"),
}

# Some bonus PBs along the way
BONUS_PBS = {
    12: ("5 km test", 5.0, "race_5k"),
    36: ("5 km club", 5.0, "race_5k"),
    60: ("10 km départemental", 10.0, "race_10k"),
}

EASY_NAMES = ["Footing matin", "Sortie facile", "Récup active", "Petit footing", "Footing en forêt", "Déblocage", "Easy run"]
LONG_NAMES = ["Sortie longue", "SL", "Long run dimanche", "Endurance fondamentale", "Sortie longue dominicale"]
TEMPO_NAMES = ["Tempo", "Allure semi", "Allure spécifique", "Tempo run 30'", "Seuil continu"]
INTERVAL_NAMES = ["Fractionné 400m", "VMA courte", "10x400", "6x800", "Pyramide", "30/30", "Côtes", "5x1000m"]
RECOVERY_NAMES = ["Footing récup", "Récupération", "Décrassage", "Footing souple"]

LOCATIONS = ["Bois de Vincennes", "Canal de l'Ourcq", "Parc de Sceaux", "Forêt de Meudon", "Buttes-Chaumont"]

def pick_session(remaining_km, vdot):
    """Choose a session type based on remaining weekly volume."""
    weights = [w for _, w in SESSION_TEMPLATES]
    types = [t for t, _ in SESSION_TEMPLATES]
    # If little left, force short easy
    if remaining_km < 6:
        return "recovery"
    return random.choices(types, weights=weights)[0]

def session_distance(stype, vdot, remaining_km):
    if stype == "easy":
        return min(remaining_km, random.uniform(6, 12))
    if stype == "long":
        # Build up long run from 12 -> 32 over time; cap by remaining
        return min(remaining_km, random.uniform(15, 28))
    if stype == "tempo":
        return min(remaining_km, random.uniform(7, 12))
    if stype == "intervals":
        return min(remaining_km, random.uniform(8, 13))
    if stype == "recovery":
        return min(remaining_km, random.uniform(4, 7))
    return 8

def session_pace(stype, vdot):
    if stype == "easy":     return easy_pace(vdot) * random.uniform(0.97, 1.04)
    if stype == "long":     return long_pace(vdot) * random.uniform(0.98, 1.05)
    if stype == "tempo":    return threshold_pace(vdot) * random.uniform(0.98, 1.02)
    if stype == "intervals": return interval_avg_pace(vdot) * random.uniform(0.97, 1.03)
    if stype == "recovery": return easy_pace(vdot) * random.uniform(1.05, 1.12)
    return easy_pace(vdot)

def session_hr(stype, vdot):
    """Return (avg_hr, max_hr) as %HRmax — improves slightly with fitness."""
    # % HRmax baseline per session type
    base_pct = {
        "easy":      0.72,   # ~126 bpm
        "long":      0.76,   # ~133 bpm (drift on long efforts)
        "tempo":     0.86,   # ~150 bpm
        "intervals": 0.83,   # ~145 bpm avg (incl. recoveries)
        "recovery":  0.65,   # ~114 bpm
    }.get(stype, 0.74)

    # Cardiovascular adaptation: at peak VDOT, HR drops ~3% at given effort
    fitness_progress = max(0, min(1, (vdot - 42) / 8))
    drop = fitness_progress * 0.025

    avg_pct = base_pct - drop + random.gauss(0, 0.015)
    avg = HR_MAX * avg_pct

    # Max HR per session: depends on type
    if stype == "intervals":
        max_pct = avg_pct + random.uniform(0.10, 0.18)  # peaks during reps
    elif stype == "tempo":
        max_pct = avg_pct + random.uniform(0.04, 0.08)
    elif stype == "long":
        max_pct = avg_pct + random.uniform(0.06, 0.12)  # late-effort drift
    elif stype == "recovery":
        max_pct = avg_pct + random.uniform(0.05, 0.10)
    else:  # easy
        max_pct = avg_pct + random.uniform(0.06, 0.12)

    mx = min(HR_MAX, HR_MAX * max_pct)
    return avg, mx

def race_hr(dist_km, vdot):
    """Race avg HR is a function of duration: shorter = higher %HRmax."""
    if dist_km <= 5.5:        avg_pct = 0.95   # 5k near max
    elif dist_km <= 11:       avg_pct = 0.92   # 10k
    elif dist_km <= 22:       avg_pct = 0.88   # semi
    elif dist_km <= 32:       avg_pct = 0.84
    else:                     avg_pct = 0.82   # marathon
    avg_pct += random.gauss(0, 0.012)
    avg = HR_MAX * avg_pct
    mx = min(HR_MAX, HR_MAX * (avg_pct + random.uniform(0.03, 0.06)))
    return avg, mx

def session_name(stype):
    if stype == "easy":     return random.choice(EASY_NAMES) + (f" - {random.choice(LOCATIONS)}" if random.random() < 0.3 else "")
    if stype == "long":     return random.choice(LONG_NAMES)
    if stype == "tempo":    return random.choice(TEMPO_NAMES)
    if stype == "intervals": return random.choice(INTERVAL_NAMES)
    if stype == "recovery": return random.choice(RECOVERY_NAMES)
    return "Course"

# ---------- Build activities ----------

activities = []
act_id = 10000000000

for w in range(WEEKS):
    week_start = START_DATE + timedelta(weeks=w)
    vdot = vdot_at_week(w)
    target_km = weekly_volume(w, vdot)
    remaining = target_km
    n_sessions = random.choices([3, 4, 5], weights=[3, 5, 2])[0]
    if 28 <= w <= 32: n_sessions = random.choice([1, 2, 2])

    # Race week
    race = RACE_WEEKS.get(w) or BONUS_PBS.get(w)
    used_days = set()

    if race:
        race_name, race_dist, race_id = race
        # Race on Sunday
        race_day = 6
        used_days.add(race_day)
        race_time_sec = vdot_to_time(vdot + 1.5, race_dist)  # peak day = +1.5 VDOT
        date = week_start + timedelta(days=race_day, hours=random.randint(-1, 2))
        race_avg, race_max = race_hr(race_dist, vdot + 1.5)
        activities.append({
            "id": act_id, "date": date, "name": race_name,
            "type": "Run", "dist_km": race_dist,
            "moving_sec": race_time_sec,
            "elev": random.randint(20, 100) if "Marathon" in race_name else random.randint(5, 50),
            "avg_hr": race_avg,
            "max_hr": race_max,
            "calories": int(race_dist * WEIGHT_KG * 0.95),
        })
        act_id += 1
        remaining -= race_dist

    days_avail = [d for d in [0, 1, 2, 3, 4, 5, 6] if d not in used_days]
    random.shuffle(days_avail)

    for i in range(min(n_sessions, len(days_avail))):
        if remaining < 4: break
        day = days_avail[i]
        stype = pick_session(remaining, vdot)
        dist = session_distance(stype, vdot, remaining)
        if dist < 3: continue
        pace = session_pace(stype, vdot)
        moving = dist * pace
        elev = max(0, int(random.gauss(30, 40) + dist * random.uniform(2, 8)))
        if stype == "long": elev = max(0, int(random.gauss(80, 50) + dist * random.uniform(3, 10)))
        avg_hr, max_hr = session_hr(stype, vdot)
        date = week_start + timedelta(days=day, hours=random.randint(-2, 3), minutes=random.randint(0, 59))

        activities.append({
            "id": act_id, "date": date, "name": session_name(stype),
            "type": "Run", "dist_km": dist, "moving_sec": moving,
            "elev": elev, "avg_hr": avg_hr, "max_hr": max_hr,
            "calories": int(dist * WEIGHT_KG * random.uniform(0.85, 1.0)),
        })
        act_id += 1
        remaining -= dist

# Sprinkle in some non-run activities (parser must filter these)
for _ in range(25):
    w = random.randint(0, WEEKS - 1)
    day = random.randint(0, 6)
    date = START_DATE + timedelta(weeks=w, days=day, hours=random.randint(8, 18))
    atype = random.choice(["Ride", "Swim", "Workout", "Yoga", "Hike"])
    if atype == "Ride":
        dist = random.uniform(20, 60); moving = dist * random.uniform(120, 180)
    elif atype == "Swim":
        dist = random.uniform(1, 3); moving = dist * random.uniform(1100, 1500)
    elif atype == "Hike":
        dist = random.uniform(8, 18); moving = dist * random.uniform(700, 900)
    else:
        dist = 0; moving = random.uniform(2400, 4500)
    activities.append({
        "id": 99000000000 + len(activities),
        "date": date,
        "name": {"Ride": "Sortie vélo", "Swim": "Natation", "Workout": "PPG", "Yoga": "Yoga récup", "Hike": "Rando"}[atype],
        "type": atype, "dist_km": dist, "moving_sec": moving,
        "elev": random.randint(0, 200) if atype in ("Ride", "Hike") else 0,
        "avg_hr": random.uniform(120, 150) if atype != "Yoga" else None,
        "max_hr": random.uniform(140, 170) if atype != "Yoga" else None,
        "calories": int(dist * 30) if dist else 200,
    })

# Sort chronologically
activities.sort(key=lambda a: a["date"])

# ---------- Write CSV in Strava format ----------

# Strava bulk export header (English) — duplicate columns are intentional
HEADER = [
    "Activity ID", "Activity Date", "Activity Name", "Activity Type", "Activity Description",
    "Elapsed Time", "Distance", "Max Heart Rate", "Relative Effort", "Commute",
    "Activity Private Note", "Activity Gear", "Filename", "Athlete Weight", "Bike Weight",
    "Elapsed Time", "Moving Time", "Distance", "Max Speed", "Average Speed",
    "Elevation Gain", "Elevation Loss", "Elevation Low", "Elevation High",
    "Max Grade", "Average Grade", "Average Positive Grade", "Average Negative Grade",
    "Max Cadence", "Average Cadence", "Max Heart Rate", "Average Heart Rate",
    "Max Watts", "Average Watts", "Calories",
]

def fmt_date(d):
    # Strava English: "Oct 1, 2024, 7:30:00 AM"
    return d.strftime("%b %d, %Y, %I:%M:%S %p").replace(" 0", " ")

def fmt_elapsed_human(sec):
    sec = int(round(sec))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h: return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"

with OUT.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(HEADER)
    for a in activities:
        elapsed = a["moving_sec"] * random.uniform(1.0, 1.08)  # elapsed slightly > moving
        dist_m = a["dist_km"] * 1000
        avg_speed_mps = (a["dist_km"] * 1000) / a["moving_sec"] if a["moving_sec"] else 0
        max_speed_mps = avg_speed_mps * random.uniform(1.2, 1.6)
        row = [
            a["id"],                        # Activity ID
            fmt_date(a["date"]),            # Activity Date
            a["name"],                      # Activity Name
            a["type"],                      # Activity Type
            "",                             # Description
            fmt_elapsed_human(elapsed),     # Elapsed Time (human)
            f"{a['dist_km']:.2f}",          # Distance (km, formatted)
            "",                             # Max Heart Rate (often empty here)
            int(random.uniform(20, 150)) if a["type"] == "Run" else "",  # Relative Effort
            "false", "", "", "", "", "",    # commute, note, gear, filename, weights
            f"{elapsed:.1f}",               # Elapsed Time (sec)
            f"{a['moving_sec']:.1f}",       # Moving Time (sec)
            f"{dist_m:.1f}",                # Distance (m)
            f"{max_speed_mps:.3f}",         # Max Speed (m/s)
            f"{avg_speed_mps:.3f}",         # Average Speed (m/s)
            a["elev"] if a["elev"] else "", # Elevation Gain
            a["elev"] if a["elev"] else "", # Elevation Loss (approx)
            "", "",                         # Elev Low / High
            "", "", "", "",                 # Grades
            "", "",                         # Cadences
            f"{a['max_hr']:.1f}" if a["max_hr"] else "",
            f"{a['avg_hr']:.1f}" if a["avg_hr"] else "",
            "", "",                         # Watts
            a["calories"] or "",
        ]
        w.writerow(row)

print(f"Generated {len(activities)} activities -> {OUT}")
print(f"  Run activities: {sum(1 for a in activities if a['type'] == 'Run')}")
print(f"  Date range: {activities[0]['date'].date()} -> {activities[-1]['date'].date()}")
total_km = sum(a['dist_km'] for a in activities if a['type'] == 'Run')
print(f"  Total running km: {total_km:.0f}")
