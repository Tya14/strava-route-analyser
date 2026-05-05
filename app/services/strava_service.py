import json
from flask import current_app
import requests


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
        return {}

    return response.json()