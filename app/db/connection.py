import pyodbc
import os

def get_conn():
    return pyodbc.connect(
        f"""
        DRIVER={{ODBC Driver 17 for SQL Server}};
        SERVER={os.getenv('DB_SERVER')};
        DATABASE={os.getenv('DB_NAME')};
        UID={os.getenv('DB_USER')};
        PWD={os.getenv('DB_PASSWORD')};
        TrustServerCertificate=yes;
        """
    )
