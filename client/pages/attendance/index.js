import Layout from "../../components/layout/layout";
import { Card, EmptyState, PageHeader } from "../../components/common";

const Attendance = () => (
  <Layout title="Attendance">
    <PageHeader title="Attendance" />
    <Card>
      <EmptyState
        title="Not available yet"
        message="Daily attendance needs classes, sections and teacher accounts, which are planned for a later phase. No sample data is shown here."
      />
    </Card>
  </Layout>
);

export default Attendance;
