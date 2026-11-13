import Layout from "../../components/layout/layout";
import { Card, EmptyState, PageHeader } from "../../components/common";

const PersonalDetails = () => (
  <Layout title="Personal Details">
    <PageHeader title="Personal Details" />
    <Card>
      <EmptyState
        title="Not available yet"
        message="Personal profiles require user login, which is planned for a later phase."
      />
    </Card>
  </Layout>
);

export default PersonalDetails;
