from app.extensions import db

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    strava_id = db.Column(db.Integer, unique=True, nullable=False)
    access_token = db.Column(db.String(255), nullable=False)

    def __repr__(self):
        return f"<User {self.strava_id}>"

class Activity(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    strava_activity_id = db.Column(db.Integer, unique=True, nullable=False)

    name = db.Column(db.String(255))
    activity_type = db.Column(db.String(50))

    started_at = db.Column(db.DateTime)

    distance_km = db.Column(db.Float)
    duration_sec = db.Column(db.Integer)

    avg_heartrate = db.Column(db.Float)
    max_heartrate = db.Column(db.Float)

    # store route for later (very important for your project)
    polyline = db.Column(db.Text)

    def __repr__(self):
        return f"<Activity {self.name}>"