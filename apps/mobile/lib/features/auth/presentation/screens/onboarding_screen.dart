import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/auth/data/barber_levels.dart';
import 'package:tapr/features/auth/presentation/auth_controller.dart';
import 'package:tapr/shared/utils/snackbar_utils.dart';
import 'package:tapr/shared/widgets/app_button.dart';
import 'package:tapr/shared/widgets/app_text_field.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  int _step = 0;
  String? _selectedRole;
  int? _selectedLevel;
  final _nameController = TextEditingController();

  int get _totalSteps {
    if (_selectedRole == 'barber') return 3;
    return 2;
  }

  bool get _isLastStep => _step == _totalSteps - 1;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _next() {
    if (_step == 0 && _selectedRole == null) {
      showErrorSnackBar(context, 'Please select a role.');
      return;
    }

    if (_step == 1 && _selectedRole == 'barber' && _selectedLevel == null) {
      showErrorSnackBar(context, 'Please select your level.');
      return;
    }

    if (_isLastStep) {
      final name = _nameController.text.trim();
      if (name.isEmpty) {
        showErrorSnackBar(context, 'Please enter your name.');
        return;
      }
      _complete(name);
      return;
    }

    setState(() => _step++);
  }

  void _back() {
    if (_step > 0) {
      setState(() => _step--);
    }
  }

  Future<void> _complete(String name) async {
    final success = await ref
        .read(authControllerProvider.notifier)
        .completeOnboarding(role: _selectedRole!, fullName: name);

    if (!success && mounted) {
      final error = ref.read(authControllerProvider).error;
      if (error != null) {
        showErrorSnackBar(context, error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _StepIndicator(current: _step, total: _totalSteps),
              const SizedBox(height: 32),
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: _buildStep(),
                ),
              ),
              const SizedBox(height: 16),
              AppButton(
                label: _isLastStep ? 'Get Started' : 'Next',
                onPressed: authState.isLoading ? null : _next,
                isLoading: authState.isLoading,
              ),
              if (_step > 0) ...[
                const SizedBox(height: 8),
                Center(
                  child: TextButton(
                    onPressed: authState.isLoading ? null : _back,
                    child: Text(
                      'Back',
                      style: AppTextStyles.body
                          .copyWith(color: AppColors.textSecondary),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStep() {
    if (_step == 0) {
      return _RoleStep(
        key: const ValueKey('role'),
        selectedRole: _selectedRole,
        onSelected: (role) => setState(() => _selectedRole = role),
      );
    }

    if (_step == 1 && _selectedRole == 'barber') {
      return _LevelStep(
        key: const ValueKey('level'),
        selectedLevel: _selectedLevel,
        onSelected: (level) => setState(() => _selectedLevel = level),
      );
    }

    return _NameStep(
      key: const ValueKey('name'),
      controller: _nameController,
    );
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.current, required this.total});

  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(total, (i) {
        final isActive = i <= current;
        return Expanded(
          child: Container(
            height: 4,
            margin: EdgeInsets.only(right: i < total - 1 ? 8 : 0),
            decoration: BoxDecoration(
              color: isActive ? AppColors.gold : AppColors.divider,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        );
      }),
    );
  }
}

class _RoleStep extends StatelessWidget {
  const _RoleStep({
    super.key,
    required this.selectedRole,
    required this.onSelected,
  });

  final String? selectedRole;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('I am a...', style: AppTextStyles.h2),
        const SizedBox(height: 8),
        Text(
          'Choose how you\'ll use TAPR',
          style: AppTextStyles.bodySecondary,
        ),
        const SizedBox(height: 24),
        _RoleCard(
          icon: Icons.person_rounded,
          title: 'Customer',
          description: 'Book barbers, discover styles',
          roleValue: 'consumer',
          isSelected: selectedRole == 'consumer',
          onTap: () => onSelected('consumer'),
        ),
        const SizedBox(height: 12),
        _RoleCard(
          icon: Icons.content_cut_rounded,
          title: 'Barber',
          description: 'Manage bookings, build your career',
          roleValue: 'barber',
          isSelected: selectedRole == 'barber',
          onTap: () => onSelected('barber'),
        ),
        const SizedBox(height: 12),
        _RoleCard(
          icon: Icons.storefront_rounded,
          title: 'Studio Owner',
          description: 'Rent chairs, scout talent',
          roleValue: 'studio',
          isSelected: selectedRole == 'studio',
          onTap: () => onSelected('studio'),
        ),
      ],
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.roleValue,
    required this.isSelected,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String description;
  final String roleValue;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppColors.gold : AppColors.divider,
            width: isSelected ? 2 : 1,
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
                  Text(title, style: AppTextStyles.h3),
                  const SizedBox(height: 2),
                  Text(description, style: AppTextStyles.caption),
                ],
              ),
            ),
            if (isSelected)
              const Icon(
                Icons.check_circle_rounded,
                color: AppColors.gold,
                size: 24,
              ),
          ],
        ),
      ),
    );
  }
}

class _LevelStep extends StatelessWidget {
  const _LevelStep({
    super.key,
    required this.selectedLevel,
    required this.onSelected,
  });

  final int? selectedLevel;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("What's your current level?", style: AppTextStyles.h2),
        const SizedBox(height: 8),
        Text(
          'This helps us match you with the right opportunities',
          style: AppTextStyles.bodySecondary,
        ),
        const SizedBox(height: 24),
        SizedBox(
          height: 140,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: barberLevels.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final bl = barberLevels[index];
              final isSelected = selectedLevel == bl.level;
              return _LevelCard(
                level: bl,
                isSelected: isSelected,
                onTap: () => onSelected(bl.level),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _LevelCard extends StatelessWidget {
  const _LevelCard({
    required this.level,
    required this.isSelected,
    required this.onTap,
  });

  final BarberLevel level;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        width: 120,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppColors.gold : AppColors.divider,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Lv.${level.level}',
              style: AppTextStyles.label,
            ),
            const SizedBox(height: 6),
            Text(
              level.title,
              style: AppTextStyles.h3.copyWith(fontSize: 16),
            ),
            const SizedBox(height: 4),
            Text(
              level.description,
              style: AppTextStyles.caption.copyWith(fontSize: 11),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class _NameStep extends StatelessWidget {
  const _NameStep({super.key, required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Your name', style: AppTextStyles.h2),
        const SizedBox(height: 8),
        Text(
          'What should we call you?',
          style: AppTextStyles.bodySecondary,
        ),
        const SizedBox(height: 24),
        AppTextField(
          controller: controller,
          hint: 'Full name',
          label: 'Name',
          autofocus: true,
          textInputAction: TextInputAction.done,
          keyboardType: TextInputType.name,
        ),
      ],
    );
  }
}
