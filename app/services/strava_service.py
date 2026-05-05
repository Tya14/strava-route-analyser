import json
from flask import current_app
import requests
from datetime import datetime



def get_activities_list(access_token):
    if current_app.config["DEV_MODE"]:
        with open("app/mock_data/activities.json") as f:
            return json.load(f)

    url = "https://www.strava.com/api/v3/athlete/activities"

    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {access_token}"}
    )

    if response.status_code != 200:
        return []

    return response.json()


def get_activity_detail(activity_id, access_token):
    if current_app.config["DEV_MODE"]:
        # just return the same mock (or extend later)
        with open("app/mock_data/activities.json") as f:
            data = json.load(f)
            return next((a for a in data if a["id"] == activity_id), {})

    url = f"https://www.strava.com/api/v3/activities/{activity_id}"

    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {access_token}"}
    )

    if response.status_code != 200:
        raise Exception(
            f"Strava API error {response.status_code}: {response.text}"
        )

    return response.json()




def get_activity_streams(activity_id, access_token):
    url = f"https://www.strava.com/api/v3/activities/{activity_id}/streams"

    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "keys": "time,heartrate,velocity_smooth",
            "key_by_type": "true"
        }
    )

    if response.status_code != 200:
        print("Stream fetch failed:", response.status_code, response.text)
        return None

    return response.json()




def compute_dashboard(activities):
    now = datetime.utcnow()

    last_7 = []
    last_30 = []

    for a in activities:
        if not a.started_at:
            continue

        days = (now - a.started_at).days

        if days <= 7:
            last_7.append(a)

        if days <= 30:
            last_30.append(a)

    # simple load proxy (distance-based for now)
    acute = sum((a.distance_km or 0) for a in last_7)
    chronic = sum((a.distance_km or 0) for a in last_30) / 4 if last_30 else 0

    ratio = acute / chronic if chronic else 0

    # simple risk model
    if ratio > 1.5:
        risk = 80
        level = "High"
        desc = "You’ve increased load too quickly."
    elif ratio > 1.2:
        risk = 60
        level = "Moderate"
        desc = "Training load rising."
    else:
        risk = 30
        level = "Low"
        desc = "Load is stable."

    return {
        "athlete_name": "You",
        "risk_score": int(risk),
        "risk_level": level,
        "risk_desc": desc,
        "acute_load": round(acute, 1),
        "chronic_load": round(chronic, 1)
    }