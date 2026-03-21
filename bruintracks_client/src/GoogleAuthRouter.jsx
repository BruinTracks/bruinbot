import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';

export const GoogleAuthRouter = () => {
    const { session, loading } = useAuth();
    const [checked, setChecked] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    useEffect(() => {
    const checkIfNewUser = async () => {
        if (!session || !session?.user) return;
        if (loading || checked) return;

        const { error } = await supabase
        .from('profiles')
        .select('profile_id')
        .eq('profile_id', session.user.id)
        .single();


        if (error && (error.code == '42P01' || error.code === 'PGRST116')) {
        navigate('/Form');
        } else {
            if (location.pathname == "/") navigate('/Home');
        }

        setChecked(true);
    };

    checkIfNewUser();
    }, [session, loading, navigate, checked, location.pathname]);
};