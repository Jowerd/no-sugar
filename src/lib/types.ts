export type CrewMember = { id: string; name: string; current_streak: number; checked_in_today: boolean; is_me: boolean };
export type ChallengeState = {
  challenge: { name: string; start_date: string; duration_days: number; goal_days?: number; app_title: string };
  me: { id: string; name: string } | null;
  crew: CrewMember[];
  my_dates: string[];
};
