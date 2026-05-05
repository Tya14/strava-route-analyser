def test_index_redirect(client):
    response = client.get("/")
    
    assert response.status_code == 302
    assert "strava.com/oauth" in response.location


def test_callback_no_code(client):
    response = client.get("/callback")
    
    assert response.status_code == 200
    assert b"No code received" in response.data