import { maintenance } from '../../server/maintenance';
export const handler = async () => {
  try {
    await maintenance();
    return { statusCode: 200 };
  } catch (e: any) {
    console.error('Maintenance failed', { code: e.code || e.name });
    return { statusCode: 500 };
  }
};
