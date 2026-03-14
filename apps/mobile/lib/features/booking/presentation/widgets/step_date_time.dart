import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/booking/data/booking_models.dart';
import 'package:tapr/features/booking/presentation/booking_controller.dart';
import 'package:tapr/shared/widgets/app_button.dart';

class StepDateTime extends StatelessWidget {
  const StepDateTime({
    super.key,
    required this.state,
    required this.onDateSelected,
    required this.onTimeSelected,
    required this.onNext,
  });

  final BookingState state;
  final ValueChanged<DateTime> onDateSelected;
  final ValueChanged<String> onTimeSelected;
  final VoidCallback onNext;

  List<String> get _timeSlots {
    final slots = <String>[];
    for (int hour = 9; hour < 19; hour++) {
      slots.add('${hour.toString().padLeft(2, '0')}:00');
      slots.add('${hour.toString().padLeft(2, '0')}:30');
    }
    return slots;
  }

  bool _isSlotBooked(String time, List<BookedSlot> bookedSlots) {
    final parts = time.split(':');
    final slotMinutes = int.parse(parts[0]) * 60 + int.parse(parts[1]);
    final serviceDuration = state.selectedService?.durationMinutes ?? 30;
    final slotEnd = slotMinutes + serviceDuration;

    for (final booked in bookedSlots) {
      final bStartParts = booked.startTime.split(':');
      final bEndParts = booked.endTime.split(':');
      final bookedStart = int.parse(bStartParts[0]) * 60 + int.parse(bStartParts[1]);
      final bookedEnd = int.parse(bEndParts[0]) * 60 + int.parse(bEndParts[1]);

      if (slotMinutes < bookedEnd && slotEnd > bookedStart) {
        return true;
      }
    }
    return false;
  }

  String _formatTimeSlot(String time) {
    final parts = time.split(':');
    final hour = int.parse(parts[0]);
    final minute = parts[1];
    final period = hour >= 12 ? 'PM' : 'AM';
    final displayHour = hour > 12 ? hour - 12 : (hour == 0 ? 12 : hour);
    return '$displayHour:$minute $period';
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final firstDay = DateTime(now.year, now.month, now.day);
    final lastDay = firstDay.add(const Duration(days: 60));

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TableCalendar<dynamic>(
                  firstDay: firstDay,
                  lastDay: lastDay,
                  focusedDay: state.selectedDate ?? firstDay,
                  selectedDayPredicate: (day) =>
                      state.selectedDate != null && isSameDay(state.selectedDate!, day),
                  onDaySelected: (selectedDay, focusedDay) {
                    onDateSelected(selectedDay);
                  },
                  calendarFormat: CalendarFormat.month,
                  availableCalendarFormats: const {CalendarFormat.month: 'Month'},
                  startingDayOfWeek: StartingDayOfWeek.monday,
                  headerStyle: HeaderStyle(
                    formatButtonVisible: false,
                    titleCentered: true,
                    titleTextStyle: AppTextStyles.h3,
                    leftChevronIcon: const Icon(
                      Icons.chevron_left,
                      color: AppColors.gold,
                    ),
                    rightChevronIcon: const Icon(
                      Icons.chevron_right,
                      color: AppColors.gold,
                    ),
                  ),
                  calendarStyle: CalendarStyle(
                    outsideDaysVisible: false,
                    defaultTextStyle: AppTextStyles.body,
                    weekendTextStyle: AppTextStyles.body,
                    todayDecoration: BoxDecoration(
                      color: AppColors.gold.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    todayTextStyle: AppTextStyles.body.copyWith(color: AppColors.gold),
                    selectedDecoration: const BoxDecoration(
                      color: AppColors.gold,
                      shape: BoxShape.circle,
                    ),
                    selectedTextStyle: AppTextStyles.body.copyWith(
                      color: AppColors.background,
                      fontWeight: FontWeight.w700,
                    ),
                    disabledTextStyle: AppTextStyles.body.copyWith(
                      color: AppColors.textSecondary.withValues(alpha: 0.3),
                    ),
                  ),
                  daysOfWeekStyle: DaysOfWeekStyle(
                    weekdayStyle: AppTextStyles.caption,
                    weekendStyle: AppTextStyles.caption,
                  ),
                  enabledDayPredicate: (day) {
                    return !day.isBefore(DateTime(now.year, now.month, now.day));
                  },
                ),
                if (state.selectedDate != null) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
                    child: Text(
                      'Available Times — ${DateFormat('EEE, MMM d').format(state.selectedDate!)}',
                      style: AppTextStyles.h3,
                    ),
                  ),
                  if (state.isLoading)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(32),
                        child: CircularProgressIndicator(color: AppColors.gold),
                      ),
                    )
                  else
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _timeSlots.map((time) {
                          final isBooked = _isSlotBooked(time, state.bookedSlots);
                          final isSelected = state.selectedTime == time;
                          return _TimeSlotChip(
                            label: _formatTimeSlot(time),
                            isBooked: isBooked,
                            isSelected: isSelected,
                            onTap: isBooked
                                ? null
                                : () => onTimeSelected(time),
                          );
                        }).toList(),
                      ),
                    ),
                  const SizedBox(height: 24),
                ],
                if (state.error != null)
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      state.error!,
                      style: AppTextStyles.caption.copyWith(color: AppColors.error),
                    ),
                  ),
              ],
            ),
          ),
        ),
        _BottomBar(
          child: AppButton(
            label: 'Continue',
            onPressed: state.canProceedStep2 ? onNext : null,
          ),
        ),
      ],
    );
  }
}

class _TimeSlotChip extends StatelessWidget {
  const _TimeSlotChip({
    required this.label,
    required this.isBooked,
    required this.isSelected,
    this.onTap,
  });

  final String label;
  final bool isBooked;
  final bool isSelected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.gold
              : isBooked
                  ? AppColors.surface.withValues(alpha: 0.5)
                  : AppColors.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected
                ? AppColors.gold
                : isBooked
                    ? Colors.transparent
                    : AppColors.divider,
          ),
        ),
        child: Text(
          label,
          style: AppTextStyles.body.copyWith(
            fontSize: 14,
            color: isSelected
                ? AppColors.background
                : isBooked
                    ? AppColors.textSecondary.withValues(alpha: 0.4)
                    : AppColors.white,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            decoration: isBooked ? TextDecoration.lineThrough : null,
          ),
        ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        24,
        16,
        24,
        16 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(
          top: BorderSide(color: AppColors.divider),
        ),
      ),
      child: child,
    );
  }
}
