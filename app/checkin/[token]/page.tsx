import CheckinClient from './CheckinClient';
import '../checkin.css';

export default async function CourseCheckinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CheckinClient token={token} />;
}
