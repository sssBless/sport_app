import { FC } from 'react';
import { Box, Container, Typography, Link } from '@mui/material';

const Footer: FC = () => {
  return (
    <Box
      component="footer"
      sx={{
        py: 3,
        px: 2,
        mt: 'auto',
        backgroundColor: (theme) =>
          theme.palette.mode === 'light'
            ? theme.palette.grey[200]
            : theme.palette.grey[800],
      }}
    >
      <Container maxWidth="sm">
        <Typography variant="body1" align="center">
          © {new Date().getFullYear()} Спорт-Апп
        </Typography>
        <Typography variant="body2" color="text.secondary" align="center">
          {'Приложение для совместных тренировок - '}
          <Link color="inherit" href="https://github.com/sssBless/sport_app">
            GitHub
          </Link>
        </Typography>
      </Container>
    </Box>
  );
};

export default Footer; 