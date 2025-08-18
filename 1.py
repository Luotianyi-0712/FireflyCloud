import requests
 
client_id = '你的client_id'
client_secret = '你的client_secret'
redirect_uri = '你的redirect_uri'
authorization_code = '你的authorization_code'
 
token_url = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
}
data = {
    'client_id': client_id,
    'scope': 'files.readwrite',
    'code': authorization_code,
    'redirect_uri': redirect_uri,
    'grant_type': 'authorization_code',
    'client_secret': client_secret
}
 
response = requests.post(token_url, headers=headers, data=data)
access_token = response.json().get('access_token')
print(f'Access Token: {access_token}')