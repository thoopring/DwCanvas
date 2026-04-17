// Verify Google access token via userinfo endpoint
interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export async function verifyGoogleAccessToken(
  accessToken: string
): Promise<GoogleUserInfo | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;

  const data = await res.json() as Record<string, string | boolean>;

  if (!data.sub || !data.email) return null;

  return {
    sub: data.sub as string,
    email: data.email as string,
    name: data.name as string | undefined,
    picture: data.picture as string | undefined,
    email_verified: data.email_verified as boolean | undefined,
  };
}
