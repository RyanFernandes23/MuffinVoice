import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    
    // Extract the Authorization header from the incoming request
    const authHeader = request.headers.get('authorization');
    
    const headers: any = {
      'Content-Type': 'application/json',
    };
    
    // Pass through the Authorization header if it exists
    if (authHeader) {
      headers['authorization'] = authHeader;
    }
    
    const response = await fetch(`${backendUrl}/payment/create-subscription`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Backend connection error:', error);
    return NextResponse.json(
      { detail: 'Failed to connect to payment server' },
      { status: 500 }
    );
  }
}
