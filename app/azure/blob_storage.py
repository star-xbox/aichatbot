import os
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv

load_dotenv()

class AzureBlobStorage:
    def __init__(self):
        self.connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        self.container_name = os.getenv("AZURE_BLOB_CONTAINER")

        if not self.connection_string or not self.container_name:
            raise ValueError("❌ Missing Azure Blob config in .env")

        self.blob_service_client = BlobServiceClient.from_connection_string(
            self.connection_string
        )

    def download_blob(self, blob_name: str) -> bytes:
        """
        Download blob và trả về bytes (phù hợp cho FastAPI response)
        """
        blob_client = self.blob_service_client.get_blob_client(
            container=self.container_name,
            blob=blob_name
        )
        print("Downloading blob from Azure:", blob_name)
        stream = blob_client.download_blob()
        return stream.readall()
