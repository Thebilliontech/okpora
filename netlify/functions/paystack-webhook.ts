import { webhook } from '../../server/payments/webhook';
export default async (request: Request) => webhook(request, 'paystack');
