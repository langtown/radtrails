import {getAppRuntime} from '@/lib/db';
import {secureApiResponse, handleApiOptions} from '@/lib/api-security';
import {handleClinicRequest} from '@/lib/clinic-http';
export async function GET(request: Request) {
  return secureApiResponse(request, async () => {
    const {clinic, rateLimiters} = await getAppRuntime();
    return handleClinicRequest(request, 'session', clinic, rateLimiters.write);
  });
}
export {handleApiOptions as OPTIONS};
