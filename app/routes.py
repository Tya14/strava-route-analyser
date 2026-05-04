from flask import Blueprint, redirect, request, current_app
import requests

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