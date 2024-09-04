import React from 'react';

interface YouTubeLogoButtonProps {
  isBound: boolean;
  onClick: () => void;
  title: string;
}

const YouTubeLogoButton: React.FC<YouTubeLogoButtonProps> = ({ isBound, onClick, title }) => {
  const fillColor = isBound ? '#FF0000' : '#61666d';

  return (
    <button onClick={onClick} title={title} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
      <svg width="68" height="48" viewBox="0 0 68 48" xmlns="http://www.w3.org/2000/svg">
        <path
          fill={fillColor}
          d="M66.9,7.3c-0.8-3-3.1-5.3-6.1-6.1C56.7,0,34,0,34,0S11.3,0,7.2,1.2C4.3,2,1.9,4.3,1.1,7.3C0,11.3,0,24,0,24 s0,12.7,1.1,16.7c0.8,3,3.1,5.3,6.1,6.1C11.3,48,34,48,34,48s22.7,0,26.7-1.2c3-0.8,5.3-3.1,6.1-6.1c1.2-4,1.2-16.7,1.2-16.7 S68,11.3,66.9,7.3z"
        />
        <polygon fill="#FFFFFF" points="26,34.1 26,13.9 42,24 " />
      </svg>
    </button>
  );
};

export default YouTubeLogoButton;