import 'package:flutter/material.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/booking/data/booking_models.dart';
import 'package:tapr/features/booking/presentation/booking_controller.dart';
import 'package:tapr/shared/widgets/app_button.dart';

class StepServiceSelection extends StatelessWidget {
  const StepServiceSelection({
    super.key,
    required this.state,
    required this.onServiceTypeSelected,
    required this.onServiceSelected,
    required this.onNext,
  });

  final BookingState state;
  final ValueChanged<String> onServiceTypeSelected;
  final ValueChanged<BarberServiceModel> onServiceSelected;
  final VoidCallback onNext;

  static const _serviceTypes = ['Studio', 'Mobile', 'On Call'];
  static const _serviceTypeIcons = {
    'Studio': Icons.storefront_rounded,
    'Mobile': Icons.directions_car_rounded,
    'On Call': Icons.phone_in_talk_rounded,
  };
  static const _serviceTypeDescriptions = {
    'Studio': 'Visit the barber at their studio',
    'Mobile': 'Barber comes to your location',
    'On Call': 'Quick on-call service nearby',
  };

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Where?', style: AppTextStyles.h2),
                const SizedBox(height: 16),
                ..._serviceTypes.map((type) {
                  final isSelected = state.selectedServiceType == type;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _ServiceTypeCard(
                      label: type,
                      icon: _serviceTypeIcons[type]!,
                      description: _serviceTypeDescriptions[type]!,
                      isSelected: isSelected,
                      onTap: () => onServiceTypeSelected(type),
                    ),
                  );
                }),
                const SizedBox(height: 32),
                Text('Service', style: AppTextStyles.h2),
                const SizedBox(height: 16),
                if (state.isLoading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: CircularProgressIndicator(
                        color: AppColors.gold,
                      ),
                    ),
                  )
                else if (state.services.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(
                        'No services available',
                        style: AppTextStyles.bodySecondary,
                      ),
                    ),
                  )
                else
                  ...state.services.map((service) {
                    final isSelected = state.selectedService?.id == service.id;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _ServiceCard(
                        service: service,
                        isSelected: isSelected,
                        onTap: () => onServiceSelected(service),
                      ),
                    );
                  }),
                if (state.error != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    state.error!,
                    style: AppTextStyles.caption.copyWith(color: AppColors.error),
                  ),
                ],
              ],
            ),
          ),
        ),
        _BottomBar(
          child: AppButton(
            label: 'Continue',
            onPressed: state.canProceedStep1 ? onNext : null,
          ),
        ),
      ],
    );
  }
}

class _ServiceTypeCard extends StatelessWidget {
  const _ServiceTypeCard({
    required this.label,
    required this.icon,
    required this.description,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final String description;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? AppColors.gold : Colors.transparent,
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: isSelected
                    ? AppColors.gold.withValues(alpha: 0.15)
                    : AppColors.background,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                icon,
                color: isSelected ? AppColors.gold : AppColors.textSecondary,
                size: 24,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: AppTextStyles.h3.copyWith(
                      color: isSelected ? AppColors.gold : AppColors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(description, style: AppTextStyles.caption),
                ],
              ),
            ),
            if (isSelected)
              const Icon(Icons.check_circle, color: AppColors.gold, size: 24),
          ],
        ),
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.service,
    required this.isSelected,
    required this.onTap,
  });

  final BarberServiceModel service;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? AppColors.gold : Colors.transparent,
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    service.name,
                    style: AppTextStyles.h3.copyWith(
                      color: isSelected ? AppColors.gold : AppColors.white,
                    ),
                  ),
                  if (service.description != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      service.description!,
                      style: AppTextStyles.caption,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(
                        Icons.schedule,
                        size: 14,
                        color: AppColors.textSecondary,
                      ),
                      const SizedBox(width: 4),
                      Text(service.formattedDuration, style: AppTextStyles.caption),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  service.formattedPrice,
                  style: AppTextStyles.h3.copyWith(color: AppColors.gold),
                ),
                if (isSelected)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Icon(Icons.check_circle, color: AppColors.gold, size: 20),
                  ),
              ],
            ),
          ],
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
