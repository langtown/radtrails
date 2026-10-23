import {getAppRuntime} from '@/lib/db';
import {handleClinicWebhook} from '@/lib/clinic-http';
export async function POST(request: Request) {
  const {db, clinic} = await getAppRuntime();
  return handleClinicWebhook(db, request, clinic);
}
