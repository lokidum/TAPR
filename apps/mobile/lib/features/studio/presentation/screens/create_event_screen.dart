import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_places_autocomplete/google_places_autocomplete.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/events/data/event_models.dart';
import 'package:tapr/features/events/data/event_repository.dart';

class CreateEventScreen extends ConsumerStatefulWidget {
  const CreateEventScreen({super.key});

  @override
  ConsumerState<CreateEventScreen> createState() => _CreateEventScreenState();
}

class _CreateEventScreenState extends ConsumerState<CreateEventScreen> {
  int _step = 0;
  final _formKey = GlobalKey<FormState>();

  // Step 1
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  EventType _eventType = EventType.workshop;

  // Step 2
  final _locationController = TextEditingController();
  String? _locationAddress;
  double? _locationLat;
  double? _locationLng;
  DateTime? _startsAt;
  DateTime? _endsAt;
  GooglePlacesAutocomplete? _placesService;
  List<Prediction> _predictions = [];
  bool _placesLoading = false;
  bool _showLocationSuggestions = false;

  // Step 3
  final _maxAttendeesController = TextEditingController();
  final _ticketPriceController = TextEditingController();
  bool _hasFoodTrucks = false;

  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _ticketPriceController.text = '0';
    _initPlaces();
  }

  Future<void> _initPlaces() async {
    try {
      final service = GooglePlacesAutocomplete(
        countries: ['au'],
        predictionsListener: (p) =>
            setState(() => _predictions = p),
        loadingListener: (loading) =>
            setState(() => _placesLoading = loading),
      );
      await service.initialize();
      if (mounted) setState(() => _placesService = service);
    } catch (_) {
      // Places API may not be configured - location will use manual entry
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _locationController.dispose();
    _maxAttendeesController.dispose();
    _ticketPriceController.dispose();
    super.dispose();
  }

  void _onLocationChanged(String value) {
    if (value.isEmpty) {
      setState(() {
        _predictions = [];
        _showLocationSuggestions = false;
      _locationAddress = null;
      _locationLat = null;
      _locationLng = null;
      });
      return;
    }
    setState(() => _showLocationSuggestions = true);
    _placesService?.getPredictions(value);
  }

  Future<void> _onPlaceSelected(Prediction prediction) async {
    if (prediction.placeId == null) return;
    final details =
        await _placesService?.getPlaceDetails(prediction.placeId!);
    if (details == null || !mounted) return;
    setState(() {
      _locationController.text = details.formattedAddress ?? prediction.title ?? '';
      _locationAddress = details.formattedAddress ?? prediction.title;
      _locationLat = details.location?.lat;
      _locationLng = details.location?.lng;
      _predictions = [];
      _showLocationSuggestions = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Create Event',
          style: AppTextStyles.h2,
        ),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: Form(
        key: _formKey,
        child: Column(
          children: [
            _StepIndicator(currentStep: _step, totalSteps: 4),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: _step == 0
                    ? _buildStep1()
                    : _step == 1
                        ? _buildStep2()
                        : _step == 2
                            ? _buildStep3()
                            : _buildStep4(),
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _isSubmitting ? null : _onNextOrSubmit,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.gold,
                      foregroundColor: AppColors.background,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    child: Text(
                      _step == 3 ? 'Create Event' : 'Continue',
                      style: AppTextStyles.body.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStep1() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Basics', style: AppTextStyles.h3),
        const SizedBox(height: 24),
        TextFormField(
          controller: _titleController,
          decoration: const InputDecoration(
            labelText: 'Title',
            hintText: 'Event title',
          ),
          style: AppTextStyles.body,
          validator: (v) =>
              (v == null || v.trim().isEmpty) ? 'Title is required' : null,
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _descriptionController,
          decoration: const InputDecoration(
            labelText: 'Description',
            hintText: 'Describe your event',
          ),
          style: AppTextStyles.body,
          maxLines: 4,
        ),
        const SizedBox(height: 24),
        Text('Event type', style: AppTextStyles.caption),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: EventType.values.map((t) {
            final selected = _eventType == t;
            return ChoiceChip(
              label: Text(t.label),
              selected: selected,
              onSelected: (_) => setState(() => _eventType = t),
              selectedColor: AppColors.gold,
              labelStyle: TextStyle(
                color: selected ? AppColors.background : AppColors.white,
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildStep2() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Location & time', style: AppTextStyles.h3),
        const SizedBox(height: 24),
        TextFormField(
          controller: _locationController,
          decoration: InputDecoration(
            labelText: 'Location',
            hintText: 'Search for a venue or address',
            suffixIcon: _placesLoading
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        color: AppColors.gold,
                        strokeWidth: 2,
                      ),
                    ),
                  )
                : null,
          ),
          style: AppTextStyles.body,
          onChanged: _onLocationChanged,
          onTap: () => setState(() => _showLocationSuggestions = true),
          validator: (v) =>
              (v == null || v.trim().isEmpty) ? 'Location is required' : null,
        ),
        if (_showLocationSuggestions && _predictions.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 8),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
            ),
            constraints: const BoxConstraints(maxHeight: 200),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: _predictions.length,
              itemBuilder: (context, i) {
                final p = _predictions[i];
                return ListTile(
                  title: Text(
                    p.title ?? '',
                    style: AppTextStyles.body,
                  ),
                  subtitle: p.description != null
                      ? Text(
                          p.description!,
                          style: AppTextStyles.caption,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        )
                      : null,
                  onTap: () => _onPlaceSelected(p),
                );
              },
            ),
          ),
        const SizedBox(height: 24),
        TextFormField(
          readOnly: true,
          decoration: InputDecoration(
            labelText: 'Start date & time',
            hintText: _startsAt != null
                ? DateFormat('MMM d, yyyy · h:mm a').format(_startsAt!)
                : 'Select',
          ),
          style: AppTextStyles.body,
          onTap: () async {
            final date = await showDatePicker(
              context: context,
              initialDate: _startsAt ?? DateTime.now(),
              firstDate: DateTime.now(),
              lastDate: DateTime.now().add(const Duration(days: 365)),
            );
            if (date == null || !mounted) return;
            final time = await showTimePicker(
              context: context,
              initialTime: _startsAt != null
                  ? TimeOfDay.fromDateTime(_startsAt!)
                  : TimeOfDay.now(),
            );
            if (time == null || !mounted) return;
            setState(() {
              _startsAt = DateTime(
                date.year,
                date.month,
                date.day,
                time.hour,
                time.minute,
              );
            });
          },
          validator: (v) => _startsAt == null ? 'Start time is required' : null,
        ),
        const SizedBox(height: 16),
        TextFormField(
          readOnly: true,
          decoration: InputDecoration(
            labelText: 'End date & time',
            hintText: _endsAt != null
                ? DateFormat('MMM d, yyyy · h:mm a').format(_endsAt!)
                : 'Select',
          ),
          style: AppTextStyles.body,
          onTap: () async {
            final date = await showDatePicker(
              context: context,
              initialDate: _endsAt ?? _startsAt ?? DateTime.now(),
              firstDate: _startsAt ?? DateTime.now(),
              lastDate: DateTime.now().add(const Duration(days: 365)),
            );
            if (date == null || !mounted) return;
            final time = await showTimePicker(
              context: context,
              initialTime: _endsAt != null
                  ? TimeOfDay.fromDateTime(_endsAt!)
                  : TimeOfDay.now(),
            );
            if (time == null || !mounted) return;
            setState(() {
              _endsAt = DateTime(
                date.year,
                date.month,
                date.day,
                time.hour,
                time.minute,
              );
            });
          },
          validator: (v) {
            if (_endsAt == null) return 'End time is required';
            if (_startsAt != null && _endsAt!.isBefore(_startsAt!)) {
              return 'End must be after start';
            }
            return null;
          },
        ),
      ],
    );
  }

  Widget _buildStep3() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Details', style: AppTextStyles.h3),
        const SizedBox(height: 24),
        TextFormField(
          controller: _maxAttendeesController,
          decoration: const InputDecoration(
            labelText: 'Max attendees (optional)',
            hintText: 'Leave empty for unlimited',
          ),
          style: AppTextStyles.body,
          keyboardType: TextInputType.number,
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _ticketPriceController,
          decoration: const InputDecoration(
            labelText: 'Ticket price (cents)',
            hintText: '0 for free',
          ),
          style: AppTextStyles.body,
          keyboardType: TextInputType.number,
        ),
        const SizedBox(height: 24),
        SwitchListTile(
          title: Text('Food trucks', style: AppTextStyles.body),
          subtitle: Text(
            'Will there be food trucks on site?',
            style: AppTextStyles.caption,
          ),
          value: _hasFoodTrucks,
          onChanged: (v) => setState(() => _hasFoodTrucks = v),
          activeThumbColor: AppColors.gold,
        ),
      ],
    );
  }

  Widget _buildStep4() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Review', style: AppTextStyles.h3),
        const SizedBox(height: 24),
        _ReviewRow(label: 'Title', value: _titleController.text),
        _ReviewRow(label: 'Type', value: _eventType.label),
        if (_descriptionController.text.isNotEmpty)
          _ReviewRow(
            label: 'Description',
            value: _descriptionController.text,
            maxLines: 3,
          ),
        _ReviewRow(label: 'Location', value: _locationController.text),
        _ReviewRow(
          label: 'Start',
          value: _startsAt != null
              ? DateFormat('MMM d, yyyy · h:mm a').format(_startsAt!)
              : '-',
        ),
        _ReviewRow(
          label: 'End',
          value: _endsAt != null
              ? DateFormat('MMM d, yyyy · h:mm a').format(_endsAt!)
              : '-',
        ),
        if (_maxAttendeesController.text.isNotEmpty)
          _ReviewRow(
            label: 'Max attendees',
            value: _maxAttendeesController.text,
          ),
        _ReviewRow(
          label: 'Ticket price',
          value: _ticketPriceController.text.isEmpty
              ? 'Free'
              : '\$${((int.tryParse(_ticketPriceController.text) ?? 0) / 100).toStringAsFixed(2)}',
        ),
        _ReviewRow(
          label: 'Food trucks',
          value: _hasFoodTrucks ? 'Yes' : 'No',
        ),
      ],
    );
  }

  void _onNextOrSubmit() {
    if (_step < 3) {
      if (!_validateStep()) return;
      setState(() => _step++);
    } else {
      _submit();
    }
  }

  bool _validateStep() {
    switch (_step) {
      case 0:
        if (!(_formKey.currentState?.validate() ?? false)) return false;
        if (_titleController.text.trim().isEmpty) return false;
        return true;
      case 1:
        if (!(_formKey.currentState?.validate() ?? false)) return false;
        if (_locationAddress == null &&
            (_locationLat == null || _locationLng == null)) {
          if (_locationController.text.trim().isNotEmpty) {
            _locationAddress = _locationController.text.trim();
          }
        }
        if (_startsAt == null || _endsAt == null) return false;
        if (_endsAt!.isBefore(_startsAt!)) return false;
        return true;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return true;
    }
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;
    if (_locationAddress == null || _locationAddress!.isEmpty) {
      _locationAddress = _locationController.text.trim();
    }
    if (_locationLat == null || _locationLng == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Please select a location from the suggestions to get coordinates',
          ),
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final repo = ref.read(eventRepositoryProvider);
      final body = CreateEventBody(
        title: _titleController.text.trim(),
        description: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
        eventType: _eventType,
        locationAddress: _locationAddress!,
        lat: _locationLat!,
        lng: _locationLng!,
        startsAt: _startsAt!,
        endsAt: _endsAt!,
        maxAttendees: int.tryParse(_maxAttendeesController.text),
        ticketPriceCents: int.tryParse(_ticketPriceController.text) ?? 0,
        hasFoodTrucks: _hasFoodTrucks,
      );

      final created = await repo.createEvent(body);

      if (!mounted) return;

      final uploadCover = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: const Text('Upload cover image?'),
          content: const Text(
            'Would you like to add a cover image for this event?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Skip', style: TextStyle(color: AppColors.gold)),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: FilledButton.styleFrom(backgroundColor: AppColors.gold),
              child: const Text('Yes'),
            ),
          ],
        ),
      );

      if (uploadCover == true && mounted) {
        final picker = ImagePicker();
        final file = await picker.pickImage(source: ImageSource.gallery);
        if (file != null) {
          try {
            await repo.uploadCoverImage(created.id, File(file.path));
          } catch (_) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Cover upload failed')),
              );
            }
          }
        }
      }

      if (mounted) {
        context.pop(true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({
    required this.currentStep,
    required this.totalSteps,
  });

  final int currentStep;
  final int totalSteps;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      child: Row(
        children: List.generate(totalSteps * 2 - 1, (i) {
          if (i.isOdd) {
            return Expanded(
              child: Container(
                height: 2,
                color: i ~/ 2 < currentStep
                    ? AppColors.gold
                    : AppColors.surface,
              ),
            );
          }
          final step = i ~/ 2;
          final isActive = step <= currentStep;
          return Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isActive ? AppColors.gold : AppColors.surface,
            ),
            child: Center(
              child: Text(
                '${step + 1}',
                style: AppTextStyles.caption.copyWith(
                  color: isActive ? AppColors.background : AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow({
    required this.label,
    required this.value,
    this.maxLines = 1,
  });

  final String label;
  final String value;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppTextStyles.caption),
          const SizedBox(height: 4),
          Text(
            value,
            style: AppTextStyles.body,
            maxLines: maxLines,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
