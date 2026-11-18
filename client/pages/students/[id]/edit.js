import { useRouter } from "next/router";
import Layout from "../../../components/layout/layout";
import { ErrorState, Loading, PageHeader } from "../../../components/common";
import StudentForm, { fromStudent } from "../../../components/forms/StudentForm";
import useApi from "../../../hooks/useApi";
import { api } from "../../../services/api";
import { fullName } from "../../../constants";

export default function EditStudent() {
  const router = useRouter();
  const { id } = router.query;
  const { data, loading, error, reload } = useApi(() => (id ? api.students.get(id) : new Promise(() => {})), [id]);

  return (
    <Layout title="Edit student" back>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
          <PageHeader title={`Edit ${fullName(data)}`} subtitle={`${data.admissionNumber} · ${data.school?.name}`} />
          <StudentForm
            initial={fromStudent(data)}
            submitLabel="Save changes"
            onSubmit={async (body) => {
              await api.students.update(id, body);
              router.replace(`/students/${id}?saved=1`);
            }}
          />
        </>
      )}
    </Layout>
  );
}
