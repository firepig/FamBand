import { Container } from 'react-bootstrap';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <>
      <Navbar />
      <Container className="mt-4 pb-5">
        <Outlet />
      </Container>
    </>
  );
}
