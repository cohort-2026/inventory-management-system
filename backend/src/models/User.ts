import mongoose from 'mongoose';

export interface IUser extends mongoose.Document {
  username: string;
  email: string;
  password: string;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
}

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);




