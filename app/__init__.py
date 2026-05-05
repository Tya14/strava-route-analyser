from flask import Flask
from config import Config
from app.extensions import db

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)

    from app.routes import main
    app.register_blueprint(main)

    from app import models  # IMPORTANT

    return app