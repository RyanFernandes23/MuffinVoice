## Error Type
Console Error

## Error Message
Failed to fetch plan data


    at usePlan.useCallback[fetchPlan] (app/hooks/usePlan.js:25:15)

## Code Frame
  23 |
  24 |       if (!response.ok) {
> 25 |         throw new Error('Failed to fetch plan data');
     |               ^
  26 |       }
  27 |
  28 |       const data = await response.json();

Next.js version: 16.0.1 (Turbopack)
