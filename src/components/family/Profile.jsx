import { useContext } from 'react'
import { Container, Card, Row, Col } from 'react-bootstrap'
import AppContext from '../../context/AppContext'
import MemberEditor from './MemberEditor'
import ChangePasswordForm from './ChangePasswordForm'

export default function Profile() {
  const { currentMember, isParent, user, family } = useContext(AppContext)
  if (!currentMember) return null

  return (
    <Container className="py-4">
      <h1 className="rt-page-title mb-3">EDIT PROFILE</h1>
      <Row className="g-4">
        <Col lg={6}>
          <Card>
            <Card.Header>My profile</Card.Header>
            <Card.Body>
              {/* key remounts the form with fresh values after a save/refresh */}
              <MemberEditor key={`${currentMember.id}:${currentMember.avatar}:${currentMember.color}:${currentMember.name}`}
                member={currentMember} canRename={isParent} />
            </Card.Body>
          </Card>
        </Col>
        {isParent && (
          <Col lg={6}>
            <Card>
              <Card.Header>Family account</Card.Header>
              <Card.Body>
                <p className="small text-muted mb-3">
                  {family?.name ? <>Family <strong>{family.name}</strong> · </> : null}
                  Signed in as <strong>{user?.email}</strong>
                </p>
                <ChangePasswordForm />
              </Card.Body>
            </Card>
          </Col>
        )}
      </Row>
    </Container>
  )
}
