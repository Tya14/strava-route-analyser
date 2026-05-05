from app.extensions import db

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    strava_id = db.Column(db.Integer, unique=True, nullable=False)
    access_token = db.Column(db.String(255), nullable=False)
    refresh_token = db.Column(db.String(255))
    expires_at = db.Column(db.Integer)

    activities = db.relationship(
        "Activity",
        backref="user",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<User {self.strava_id}>"


class Activity(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    strava_activity_id = db.Column(db.Integer, unique=True, nullable=False)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False
    )

    name = db.Column(db.String(255))
    activity_type = db.Column(db.String(50))
    started_at = db.Column(db.DateTime)

    distance_km = db.Column(db.Float)
    duration_sec = db.Column(db.Integer)

    avg_heartrate = db.Column(db.Float)
    max_heartrate = db.Column(db.Float)

    polyline = db.Column(db.Text)

    # 🔗 relationship to streams
    streams = db.relationship(
        "ActivityStream",
        backref="activity",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Activity {self.name}>"


class ActivityStream(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    activity_id = db.Column(
        db.Integer,
        db.ForeignKey("activity.id"),
        nullable=False,
        index=True
    )

    time = db.Column(db.Integer)  # seconds since activity start

    heartrate = db.Column(db.Float)
    speed = db.Column(db.Float)   # meters per second
    pace = db.Column(db.Float)    # minutes per km

    def __repr__(self):
        return f"<Stream activity={self.activity_id} t={self.time}>"