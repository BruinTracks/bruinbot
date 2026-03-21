// src/GoogleAuthButton.jsx
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient';

const GoogleAuthButton = ({ children, className = '', title }) => {
  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });

    if (error) return;
  };

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      className={`cursor-pointer ${className}`.trim()}
      title={title}
    >
      {children}
    </button>
  );
};

GoogleAuthButton.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  title: PropTypes.string,
};

export default GoogleAuthButton;
