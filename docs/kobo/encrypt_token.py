"""Encrypt the Kobo API token using v1.<iv>.<ciphertext+tag> format (AES-256-GCM)."""
import base64, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY = base64.b64decode("uKR1xntPuvM/f/8mDqii+03eUhRo1zzpRK+a97gpJyg=")
TOKEN = "20bfa5670ef1d4ca2df3deb3a1469dbd88e72340"

iv = os.urandom(12)
aesgcm = AESGCM(KEY)
ciphertext_and_tag = aesgcm.encrypt(iv, TOKEN.encode("utf-8"), None)

# Format: v1.<base64(iv)>.<base64(ciphertext+tag)>
encrypted = f"v1.{base64.b64encode(iv).decode()}.{base64.b64encode(ciphertext_and_tag).decode()}"
print(encrypted)
