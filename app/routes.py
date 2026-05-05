from flask import Blueprint, redirect, request, current_app
import requests
from app.extensions import db
from app.models import User

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

    # 4. Debug output (temporary)
    return f"""
    <h2>Login Successful</h2>
    <p><b>Athlete:</b> {athlete}</p>
    <p><b>Access Token:</b> {access_token}</p>
    """