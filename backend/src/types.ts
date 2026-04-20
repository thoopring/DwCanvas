export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  APP_ENV: string;
  FREE_LAUNCH?: string; // "true" during pre-paid launch period
  ANTHROPIC_API_KEY: string;
  LEMONSQUEEZY_API_KEY: string;
  LEMONSQUEEZY_WEBHOOK_SECRET: string;
  LEMONSQUEEZY_STORE_ID: string;
  GOOGLE_CLIENT_ID: string;
  JWT_SECRET: string;
}

export interface User {
  id: number;
  google_sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: number;
  lemon_customer_id: string | null;
  lemon_subscription_id: string | null;
  lemon_variant_id: string | null;
  plan: 'free' | 'creator' | 'pro';
  plan_status: 'trial' | 'active' | 'past_due' | 'canceled';
  current_period_end: number | null;
  trial_used: number;
  display_name: string | null;
  handle: string | null;
  brand_color: string | null;
  default_template: string | null;
  voice_profile: string | null;
  voice_samples: string | null;
  voice_trained_at: number | null;
}

export interface VoiceProfile {
  directive: string;
  tone: string;
  pacing: string;
  signature_moves: string[];
  avoid: string[];
}

export interface Video {
  id: string;
  user_id: number;
  youtube_id: string;
  title: string | null;
  channel: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  created_at: number;
  status: 'processing' | 'ready' | 'failed';
  persona: string;
  insights_json: string | null;
  carousel_json: string | null;
  zip_r2_key: string | null;
  watermarked: number;
  is_favorite: number;
}

export interface JWTPayload {
  sub: string; // google_sub
  email: string;
  uid: number; // user.id
  iat: number;
  exp: number;
}

export interface Insight {
  t: number;        // timestamp in seconds
  headline: string;
  body: string;
}

export interface CarouselSlide {
  title: string;
  body: string;
}

export interface Carousel {
  hook: string;
  slides: CarouselSlide[];
  cta: string;
  hashtags: string[];
}
