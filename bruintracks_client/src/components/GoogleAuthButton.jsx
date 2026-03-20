// src/GoogleAuthButton.jsx
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient';

const GoogleAuthButton = ({ children }) => {
  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });

    if (error) return;
  };

  return (
    <button onClick={handleGoogleSignIn}>
      {children}
    </button>
  );
};

GoogleAuthButton.propTypes = {
  children: PropTypes.node,
};

export default GoogleAuthButton;
