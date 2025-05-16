import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  uuid: string | null;
  username: string | null;
  displayName: string | null;
  signature: string | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  uuid: localStorage.getItem('uuid'),
  username: localStorage.getItem('username'),
  displayName: localStorage.getItem('displayName'),
  signature: localStorage.getItem('signature'),
  isAuthenticated: false
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth: (state, action: PayloadAction<{ uuid: string; username: string; displayName?: string; signature: string }>) => {
      console.log('Setting auth state:', {
        uuid: action.payload.uuid,
        username: action.payload.username,
        displayName: action.payload.displayName,
        signatureStart: action.payload.signature ? action.payload.signature.substring(0, 5) + '...' : 'none'
      });
      
      state.uuid = action.payload.uuid;
      state.username = action.payload.username;
      state.displayName = action.payload.displayName || action.payload.username;
      state.signature = action.payload.signature;
      state.isAuthenticated = true;
      
      // Сохраняем в localStorage
      localStorage.setItem('uuid', action.payload.uuid);
      localStorage.setItem('username', action.payload.username);
      if (action.payload.displayName) {
        localStorage.setItem('displayName', action.payload.displayName);
      } else {
        localStorage.setItem('displayName', action.payload.username);
      }
      localStorage.setItem('signature', action.payload.signature);
      
      console.log('Auth data saved to localStorage');
    },
    updateProfile: (state, action: PayloadAction<{ displayName?: string }>) => {
      if (action.payload.displayName) {
        state.displayName = action.payload.displayName;
        localStorage.setItem('displayName', action.payload.displayName);
      }
    },
    logout: (state) => {
      state.uuid = null;
      state.username = null;
      state.displayName = null;
      state.signature = null;
      state.isAuthenticated = false;
      localStorage.removeItem('uuid');
      localStorage.removeItem('username');
      localStorage.removeItem('displayName');
      localStorage.removeItem('signature');
    }
  }
});

export const { setAuth, updateProfile, logout } = authSlice.actions;
export default authSlice.reducer; 