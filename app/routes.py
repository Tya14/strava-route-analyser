from flask import Blueprint, redirect, request, current_app
import requests
from app.extensions import db
from app.models import User, Activity
from app.services.strava_service import get_activities_list, get_activity_detail
from datetime import datetime


main = Blueprint("main", __name__)

@main.route("/")
def index():
    client_id = current_app.config["STRAVA_CLIENT_ID"]
    redirect_uri = current_app.config["STRAVA_REDIRECT_URI"]

    

    url = (
        f"https://www.strava.com/oauth/authorize"
        f"?client_id={client_id}"
        f"&response_type=code"
        f"&redirect_uri={redirect_uri}"
        f"&approval_prompt=auto"
        f"&scope=activity:read_all"
    )

    return redirect(url)

@main.route("/callback")
def callback():
    from flask import request, current_app
    import requests

    # 1. Get the code from URL
    code = request.args.get("code")

    if not code:
        return "Error: No code received from Strava"

    # 2. Exchange code for access token
    token_url = "https://www.strava.com/oauth/token"

    response = requests.post(token_url, data={
        "client_id": current_app.config["STRAVA_CLIENT_ID"],
        "client_secret": current_app.config["STRAVA_CLIENT_SECRET"],
        "code": code,
        "grant_type": "authorization_code"
    })

    data = response.json()

    # 3. Extract info
    access_token = data.get("access_token")
    athlete = data.get("athlete")

    strava_id = athlete.get("id")

    # Check if user already exists
    user = User.query.filter_by(strava_id=strava_id).first()

    if not user:
        # Create new user
        user = User(
            strava_id=strava_id,
            access_token=access_token
        )
        db.session.add(user)
    else:
        # Update existing user's token
        user.access_token = access_token

    # Save to database
    db.session.commit()

    activities = get_activities_list(access_token)


    for act in activities:
        existing = Activity.query.filter_by(
            strava_activity_id=int(act["id"])
        ).first()

        polyline = act.get("map", {}).get("summary_polyline")

        if not polyline:
            detail_data = get_activity_detail(act["id"],access_token)
            polyline = detail_data.get("map", {}).get("summary_polyline")


        if existing:
            if not existing.polyline:
                existing.polyline = polyline
            if not existing.avg_heartrate:
                existing.avg_heartrate = act.get("average_heartrate")

        else:
            
            activity = Activity(
                strava_activity_id=act["id"],
                user_id=user.id,
                name=act.get("name"),
                activity_type=act.get("type"),
                started_at=datetime.fromisoformat(
                    act.get("start_date").replace("Z", "")
                ) if act.get("start_date") else None,
                distance_km=act.get("distance", 0) / 1000,
                duration_sec=act.get("moving_time"),
                avg_heartrate=act.get("average_heartrate"),
                max_heartrate=act.get("max_heartrate"),
                polyline=polyline
            )
            db.session.add(activity)

    db.session.commit()

    # 4. Debug output (temporary)
    return f"""
    <h2>Login Successful</h2>
    <p><b>Athlete:</b> {athlete}</p>
    <p><b>Access Token:</b>{access_token} </p>
    """