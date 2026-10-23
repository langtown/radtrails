import type {Metadata} from 'next';
import ClinicShop from '@/components/ClinicShop';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {title: 'Clinics & rentals | Ride and Develop', description: 'Riding clinics and e-bike rentals with Ride and Develop.'};
export default async function ClinicPage() {
  return <ClinicShop />;
}
