from authlib.integrations.starlette_client import OAuth

oauth = OAuth()

# def init_oauth(app):
#     oauth.register(
#         name="microsoft",
#         client_id=app.state.CLIENT_ID,
#         client_secret=app.state.CLIENT_SECRET,
#         server_metadata_url=f"https://login.microsoftonline.com/{app.state.TENANT_ID}/v2.0/.well-known/openid-configuration",
#         client_kwargs={"scope": "openid email profile"},
#     )


def init_oauth(app):
    oauth.register(
        name="microsoft",
        client_id=app.state.CLIENT_ID,
        client_secret=app.state.CLIENT_SECRET,
        # server_metadata_url=f"https://login.microsoftonline.com/{app.state.TENANT_ID}/v2.0/.well-known/openid-configuration",
        server_metadata_url = "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
        client_kwargs={
            "scope": "openid email profile"
        }
    )
