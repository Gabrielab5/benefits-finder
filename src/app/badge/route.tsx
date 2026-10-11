import { ImageResponse } from 'next/og';

/** Status-bar badge for notifications: Android draws only the alpha channel, so a white mark on transparent. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 82, fontWeight: 700 }}>
        ₪
      </div>
    ),
    { width: 96, height: 96, headers: { 'cache-control': 'public, max-age=604800, immutable' } },
  );
}
