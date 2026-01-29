import uuid
from app.db.connection import get_conn

def get_user_by_email(email: str):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT TOP 1 *
        FROM M_User
        WHERE EmailAddress = ?
          AND DeleteFlg = 0
    """, email)

    row = cur.fetchone()
    conn.close()

    return row

def upsert_user(email, microsoft_id, display_name, provider):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        IF EXISTS (
            SELECT 1 FROM M_User WHERE EmailAddress = ?
        )
        BEGIN
            UPDATE M_User
            SET
                MicrosoftId = ?,
                DisplayName = ?,
                LastLoginAt = GETDATE(),
                Provider = ?
            WHERE EmailAddress = ?
        END
        ELSE
        BEGIN
            INSERT INTO M_User
            ( MicrosoftId, LoginName, DisplayName, EmailAddress, Provider, LastLoginAt, CreatedAt)
            VALUES
            (?, ?, ?, ?, ?, GETDATE(),GETDATE())
        END
    """,
    email,
    microsoft_id,
    display_name,
    provider,
    email,    
    microsoft_id,
    email,
    display_name,
    email,
    provider
    )

    conn.commit()

    # lấy lại user
    cur.execute("""
        SELECT TOP 1 *
        FROM M_User
        WHERE EmailAddress = ?
            AND DeleteFlg = 0
    """, email)

    row = cur.fetchone()
    if row is None:
        return None

    columns = [col[0] for col in cur.description]
    user = dict(zip(columns, row))

    conn.close()
    return user