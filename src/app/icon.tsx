import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#161d38', color: '#3ee8ad', fontSize: 320, fontWeight: 700 }}>
        ₪
      </div>
    ),
    size,
  );
}
