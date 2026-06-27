import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase using the server-side environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to generate Google OAuth2 Access Token using Service Account JSON via native Node crypto (no libraries)
async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  // Format key properly (handling literal escapes gracefully)
  const privateKey = serviceAccount.private_key.replace(/\\n/g, '\n');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${encodedHeader}.${encodedPayload}`);
  const signature = sign.sign(privateKey, 'base64url');

  const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange JWT for access token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { tokens, title, body, chatId } = await request.json();

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ success: true, message: 'No target tokens provided.' });
    }

    // 1. Fetch FCM Service Account JSON from app_config table
    const { data: config, error: configError } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'fcm_service_account')
      .single();

    if (configError || !config?.value) {
      console.error('FCM Service Account not configured in database:', configError);
      return NextResponse.json(
        { success: false, error: 'FCM service account credentials are not configured in the database.' },
        { status: 500 }
      );
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(config.value);
    } catch (parseErr) {
      return NextResponse.json(
        { success: false, error: 'FCM service account value is not a valid JSON.' },
        { status: 500 }
      );
    }

    if (!serviceAccount.private_key || !serviceAccount.client_email || !serviceAccount.project_id) {
      return NextResponse.json(
        { success: false, error: 'FCM service account is missing required fields (private_key, client_email, project_id).' },
        { status: 500 }
      );
    }

    // 2. Fetch OAuth2 token from Google OAuth servers
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    // 3. Send notifications in parallel to all device tokens
    const sendPromises = tokens.map(async (token) => {
      try {
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            message: {
              token: token,
              notification: {
                title: title,
                body: body
              },
              data: {
                chat_id: chatId || 'general'
              }
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`FCM v1 sending error for token ${token}:`, errText);
          return { token, success: false, error: errText };
        }

        const resData = await response.json();
        return { token, success: true, messageId: resData.name };
      } catch (err: any) {
        console.error(`FCM v1 network error for token ${token}:`, err);
        return { token, success: false, error: err.message };
      }
    });

    const results = await Promise.all(sendPromises);
    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      success: true,
      message: `Dispatched notifications to ${successCount}/${tokens.length} devices.`,
      results
    });

  } catch (error: any) {
    console.error('send-push API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
