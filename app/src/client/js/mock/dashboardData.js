/* Sample data for the dashboard preview page (mock only — no business
   logic yet). Kept separate from the page so real modules can replace
   it later without touching the layout code. */

export const stats = [
  { icon: 'list-checks', label: 'Tasks due today', value: '4', meta: '2 high priority' },
  { icon: 'utensils', label: 'Meals this week', value: '14', meta: '3 still to plan' },
  { icon: 'cart', label: 'Shopping list', value: '9', meta: '6 picked up' },
  { icon: 'wallet', label: 'Budget left', value: '320', meta: 'this month' },
];

export const chart = [
  { label: 'Mon', value: 2 },
  { label: 'Tue', value: 4 },
  { label: 'Wed', value: 1 },
  { label: 'Thu', value: 3 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 2 },
  { label: 'Sun', value: 0 },
];

export const chartCaption = 'Meals cooked per day';

export const tasks = [
  { title: 'Order weekly groceries', meta: 'Shopping · today', status: 'pending' },
  { title: 'Pay electricity bill', meta: 'Finance · today', status: 'pending' },
  { title: 'Deep clean the kitchen', meta: 'Home · this week', status: 'ok' },
  { title: 'Plan Saturday dinner', meta: 'Meals · Friday', status: 'pending' },
];

export const diary = [
  { title: 'Quiet morning, warm chai', meta: 'Today · 07:40' },
  { title: 'Panipuri night with the kids', meta: 'Yesterday · 20:15' },
  { title: 'Sunday grocery haul', meta: '2 days ago · 11:05' },
];

export const shopping = {
  label: 'Weekly groceries',
  picked: 6,
  total: 9,
};

export const suggestions = {
  title: 'Kitchen inspiration',
  text: 'Recipe ideas based on what is already in your pantry will appear here.',
};
