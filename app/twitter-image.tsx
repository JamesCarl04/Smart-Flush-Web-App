import { ImageResponse } from 'next/og';

export const alt = 'Klir IoT Smart Flush & Disinfection Management System';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0B0F19',
          backgroundImage:
            'radial-gradient(circle at 90% 15%, rgba(181, 18, 27, 0.32) 0%, transparent 50%), radial-gradient(circle at 10% 85%, rgba(201, 162, 39, 0.22) 0%, transparent 45%), radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.6) 0%, transparent 100%)',
          padding: '56px 64px',
          position: 'relative',
          fontFamily: 'sans-serif',
          color: '#FFFFFF',
        }}
      >
        {/* Subtle decorative inner border */}
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            right: 24,
            bottom: 24,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 24,
            pointerEvents: 'none',
            display: 'flex',
          }}
        />

        {/* Top Header Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            zIndex: 10,
          }}
        >
          {/* Brand + Logo Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            {/* Droplet badge icon with subtle border and glow */}
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                backgroundColor: 'rgba(181, 18, 27, 0.18)',
                border: '1.5px solid rgba(181, 18, 27, 0.6)',
                boxShadow: '0 0 24px rgba(181, 18, 27, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"
                  fill="#B5121B"
                />
                <path
                  d="M12 5.5l3.5 3.5a5 5 0 1 1-7 0z"
                  fill="#E46167"
                  opacity="0.85"
                />
                <circle cx="10" cy="14" r="1.5" fill="#FFFFFF" opacity="0.9" />
              </svg>
            </div>

            {/* Brand Title: KLIR */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '2px',
              }}
            >
              <span
                style={{
                  fontSize: '44px',
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  color: '#FFFFFF',
                }}
              >
                KLIR
              </span>
              <span
                style={{
                  fontSize: '44px',
                  fontWeight: 900,
                  color: '#B5121B',
                }}
              >
                .
              </span>
            </div>
          </div>

          {/* Status Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 22px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              boxShadow: '0 0 16px rgba(16, 185, 129, 0.2)',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '9999px',
                backgroundColor: '#34D399',
                boxShadow: '0 0 8px #34D399',
              }}
            />
            <span
              style={{
                color: '#34D399',
                fontSize: '15px',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              ⚡ System Status: Online • HiveMQ IoT Cluster
            </span>
          </div>
        </div>

        {/* Center Hero Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            zIndex: 10,
            maxWidth: '1060px',
          }}
        >
          {/* Tagline / Subtitle */}
          <h1
            style={{
              fontSize: '54px',
              fontWeight: 800,
              color: '#F8FAFC',
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              margin: 0,
            }}
          >
            IoT Smart Flush &amp; Disinfection Platform
          </h1>

          {/* Value Proposition */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {[
              'Real-time Telemetry',
              'Automated UV Cycles',
              'Water Analytics',
              'Predictive Maintenance',
            ].map((prop, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#E2E8F0',
                  fontSize: '17px',
                  fontWeight: 500,
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '9999px',
                    backgroundColor: idx === 1 ? '#C9A227' : idx === 2 ? '#0284C7' : idx === 3 ? '#10B981' : '#B5121B',
                  }}
                />
                <span>{prop}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: '20px',
            zIndex: 10,
          }}
        >
          {/* Subtle footer */}
          <span
            style={{
              color: '#94A3B8',
              fontSize: '15px',
              fontWeight: 500,
              letterSpacing: '0.02em',
            }}
          >
            Designed for High-Traffic Commercial Restrooms
          </span>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                color: '#C9A227',
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Enterprise Fleet Edition
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
