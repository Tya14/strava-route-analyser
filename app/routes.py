from flask import Blueprint, redirect, request, current_app, jsonify, session, send_from_directory
import requests
from app.extensions import db
from app.models import User, Activity, ActivityStream
from app.services.strava_service import get_activities_list, get_activity_detail, get_activity_streams, compute_dashboard
from datetime import datetime
import os


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
    from flask import request, current_app, session
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

    
    with db.session.no_autoflush:

        for act in activities:
            existing = Activity.query.filter_by(
                strava_activity_id=int(act["id"])
            ).first()
            

            if existing:


                if not existing.polyline:


                    polyline = act.get("map", {}).get("summary_polyline")

                    if not polyline:

                        detail_data = get_activity_detail(act["id"],access_token)
                        map_data = detail_data.get("map", {})
                        polyline = (
                            map_data.get("polyline") or
                            map_data.get("summary_polyline")
                        )
                        

            
                    existing.polyline = polyline

            else:

                polyline = act.get("map", {}).get("summary_polyline")

                if not polyline:

                    detail_data = get_activity_detail(act["id"],access_token)
                    map_data = detail_data.get("map", {})
                    polyline = (
                        map_data.get("polyline") or
                        map_data.get("summary_polyline")
                    )
                    
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


                # 🚨 FETCH AND STORE STREAMS

                streams = get_activity_streams(activity.strava_activity_id, access_token)

                if streams:
                    times = streams.get("time", {}).get("data", [])
                    heartrate = streams.get("heartrate", {}).get("data", [])
                    velocity = streams.get("velocity_smooth", {}).get("data", [])

                    # avoid duplicates
                    if not activity.streams:
                        for i in range(len(times)):
                            speed = velocity[i] if i < len(velocity) else None
                            hr = heartrate[i] if i < len(heartrate) else None

                            pace = 1000 / speed / 60 if speed and speed > 0 else None

                            stream = ActivityStream(
                                activity=activity,   # 👈 IMPORTANT (not activity_id)
                                time=times[i],
                                heartrate=hr,
                                speed=speed,
                                pace=pace
                            )

                            db.session.add(stream)

    db.session.commit()

    

    session["user_id"] = user.id

    # 4. Debug output (temporary)
    return f"""
    <h2>Login Successful</h2>
    <p><b>Athlete:</b> {act["id"]}</p>
    <p><b>Access Token:</b>{existing} </p>
    """


@main.route("/activities")
def get_activities():
    user_id = session.get("user_id")

    if not user_id:
        return {"error": "unauthorized"}, 401

    activities = Activity.query.filter_by(user_id=user_id).all()

    return jsonify([
        {
            "id": a.id,
            "name": a.name,
            "type": a.activity_type,
            "distance": a.distance_km,
            "avg_hr": a.avg_heartrate,
            "date": a.started_at.strftime("%Y-%m-%d") if a.started_at else None
        }
        for a in activities
    ])


from flask import jsonify, session
from app.models import Activity


@main.route("/activity/<int:id>")
def get_activity(id):
    user_id = session.get("user_id")

    if not user_id:
        return {"error": "unauthorized"}, 401

    activity = Activity.query.filter_by(
        id=id,
        user_id=user_id   # 🔐 critical
    ).first()

    if not activity:
        return {"error": "not found"}, 404

    return jsonify({
        "id": activity.id,
        "name": activity.name,
        "started_at": activity.started_at.isoformat() if activity.started_at else None,
        "polyline": activity.polyline,
        "distance": activity.distance_km,
        "duration": activity.duration_sec
    })

@main.route("/activity/<int:id>/streams")
def get_activity_streams_endpoint(id):
    user_id = session.get("user_id")

    if not user_id:
        return {"error": "unauthorized"}, 401

    # 🔐 ensure activity belongs to user
    activity = Activity.query.filter_by(
        id=id,
        user_id=user_id
    ).first()

    if not activity:
        return {"error": "not found"}, 404

    streams = ActivityStream.query.filter_by(activity_id=activity.id).all()

    return jsonify({
        "time": [s.time for s in streams],
        "heartrate": [s.heartrate for s in streams],
        "pace": [s.pace for s in streams]
    })


from flask import jsonify, session
from app.models import Activity


@main.route("/routes")
def get_routes():
    user_id = session.get("user_id")

    if not user_id:
        return {"error": "unauthorized"}, 401

    activities = Activity.query.filter_by(user_id=user_id).all()

    return jsonify([
        {
            "id": a.id,
            "name": a.name,
            "started_at": a.started_at.isoformat() if a.started_at else None,
            "distance_km": a.distance_km,
            "polyline": a.polyline
        }
        for a in activities
        if a.polyline   # only return activities with routes
    ])




@main.route("/dashboard")
def get_dashboard():
    user_id = session.get("user_id")

    if not user_id:
        return {"error": "unauthorized"}, 401

    activities = Activity.query.filter_by(user_id=user_id).all()

    data = compute_dashboard(activities)

    return jsonify(data)

# absolute path to frontend folder
FRONTEND_DIR = os.path.join(os.getcwd(), "frontend")


@main.route("/app")
def serve_frontend():
    return send_from_directory(FRONTEND_DIR, "index.html")


@main.route("/frontend/<path:path>")
def serve_static(path):
    return send_from_directory(FRONTEND_DIR, path)