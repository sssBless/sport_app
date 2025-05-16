import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface TimerState {
  seconds: number;
  isActive: boolean;
}

const initialState: TimerState = {
  seconds: 0,
  isActive: false,
};

const timerSlice = createSlice({
  name: 'timer',
  initialState,
  reducers: {
    startTimer: (state, action: PayloadAction<number>) => {
      state.seconds = action.payload;
      state.isActive = true;
    },
    stopTimer: (state) => {
      state.isActive = false;
      state.seconds = 0;
    },
    tick: (state) => {
      if (state.seconds > 0) {
        state.seconds -= 1;
      } else {
        state.isActive = false;
      }
    }
  },
});

export const { startTimer, stopTimer, tick } = timerSlice.actions;
export default timerSlice.reducer; 