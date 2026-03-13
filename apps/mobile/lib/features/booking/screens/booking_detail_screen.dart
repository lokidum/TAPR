import 'package:flutter/material.dart';
import 'package:tapr/shared/widgets/placeholder_screen.dart';

class BookingDetailScreen extends StatelessWidget {
  const BookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(title: 'Booking: $bookingId');
  }
}
