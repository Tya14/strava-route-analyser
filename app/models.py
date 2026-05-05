from app.extensions import db

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    strava_id = db.Column(db.Integer, unique=True, nullable=False)
    access_token = db.Column(db.String(255), nullable=False)

    def __repr__(self):
        return f"<User {self.strava_id}>"