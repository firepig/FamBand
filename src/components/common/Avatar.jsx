import { isImageAvatar, avatarImageUrl } from '../../utils/images'

// Renders a member avatar: an uploaded image ("img:<file>") or an emoji.
// Sizes with the surrounding font-size by default (1em), so it drops in
// wherever an emoji <span> used to be.
export default function Avatar({ avatar, size = '1em', className = '', style }) {
  if (isImageAvatar(avatar)) {
    return (
      <img
        src={avatarImageUrl(avatar)}
        alt=""
        className={className}
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          border: '2px solid #fff', boxSizing: 'border-box',
          verticalAlign: 'middle', display: 'inline-block', ...style,
        }}
      />
    )
  }
  return <span className={className} style={style}>{avatar || '👤'}</span>
}
